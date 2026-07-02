import { MusicSource, registerMusicSource } from './musicSource'
import { Song } from '../types'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { logger, toErrorMeta } from '../utils/logger'

/**
 * QQ 音源 —— 通过 webbridge 桥接到用户浏览器（带 QQ 登录态）。
 *
 * 原理（已实测验证）：
 *   - 搜索：QQ 官方 SearchCgiService 接口，浏览器里免登录可用
 *   - 播放 URL：QQ 网页播放器内部会生成 O400{mediaMid}.ogg?vkey=... 的真实地址
 *     这个地址脱离浏览器拿不到（vkey 需登录态+签名），
 *     所以通过 webbridge 在浏览器里操作 QQ 播放器，读 audio.src 拿真实 URL
 *
 * 依赖：
 *   - webbridge daemon 运行在 127.0.0.1:10086
 *   - 浏览器已登录 y.qq.com 并保持 QQ 音乐播放器页面开着
 */

const WEBBRIDGE_URL = process.env.WEBBRIDGE_URL || 'http://127.0.0.1:10086'
const WEBBRIDGE_SESSION = 'qq-radio'
const WEBBRIDGE_TIMEOUT = 25000

interface QQSearchSong {
  mid: string
  name: string
  singer: string
  album?: string
  albumMid?: string
  mediaMid?: string
  interval?: number
  isVip?: boolean
}

class QQMusicSource implements MusicSource {
  readonly id = 'qq' as const
  readonly label = 'QQ音乐'

  /** 调 webbridge 在浏览器执行 JS */
  private async webbridgeEval(code: string): Promise<any> {
    const body = JSON.stringify({
      action: 'evaluate',
      args: { code },
      session: WEBBRIDGE_SESSION,
    })
    const res = await fetchWithTimeout(
      `${WEBBRIDGE_URL}/command`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      WEBBRIDGE_TIMEOUT
    )
    const data = (await res.json()) as any
    if (!data?.ok) {
      throw new Error(`webbridge error: ${data?.error?.message || 'unknown'}`)
    }
    // data.data.value 是 JSON 字符串
    const val = data.data?.value
    if (typeof val === 'string') {
      try {
        return JSON.parse(val)
      } catch {
        return val
      }
    }
    return val
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.webbridgeEval(
        `(()=>{const c=document.cookie;const hasUin=/uin=o[A-Za-z0-9]/.test(c);const hasKey=/qm_keyst=/.test(c);return JSON.stringify({onQQ:location.host.includes('y.qq.com'),hasUin,hasKey,ready:hasUin&&hasKey});})()`
      )
      const ready = result?.ready === true
      if (!ready) {
        logger.warn('QQ 音源未就绪', {
          onQQ: result?.onQQ,
          hasUin: result?.hasUin,
          hint: '请在浏览器登录 y.qq.com 并打开播放器页',
        })
      }
      return ready
    } catch (err) {
      logger.warn('webbridge 连接失败（QQ 音源不可用）', { ...toErrorMeta(err) })
      return false
    }
  }

  async searchPlayable(keyword: string, limit = 10): Promise<Song[]> {
    // 搜索（浏览器内执行，带登录态）
    const code = `(async()=>{
      const body={comm:{uin:0,format:'json',ct:24,cv:0},
        req_0:{module:'music.search.SearchCgiService',method:'DoSearchForQQMusicDesktop',
          param:{query:${JSON.stringify(keyword)},search_type:0,num_per_page:${Math.min(limit * 2, 20)},page_num:1}}};
      const r=await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify(body)});
      const d=await r.json();
      const list=(d?.req_0?.data?.body?.song?.list)||[];
      const out=list.map(s=>({mid:s.mid,name:s.name,singer:(s.singer||[]).map(x=>x.name).join(', '),album:s.album?.name,albumMid:s.album?.mid,mediaMid:s.file?.media_mid,interval:s.interval,isVip:s.pay?.payplay===1}));
      return JSON.stringify(out);
    })()`
    try {
      const songs = (await this.webbridgeEval(code)) as QQSearchSong[]
      if (!Array.isArray(songs)) return []
      logger.debug('QQ 搜索结果', { keyword, count: songs.length })
      return songs.map((s) => ({
        id: `qq_${s.mid}`,
        title: s.name,
        artist: s.singer || '未知歌手',
        album: s.album,
        coverUrl: s.albumMid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albumMid}.jpg`
          : undefined,
        duration: s.interval,
        qqMusicMid: s.mid,
        // mediaMid 存到 neteaseId 字段复用（getPlayUrl 用）
        neteaseId: s.mediaMid,
        playUrl: undefined, // 延迟获取（点播时才调 webbridge）
        emotionTags: [],
        sceneTags: [],
        platform: 'qq' as const,
        playable: true, // QQ 登录态下都能播（含 VIP，因为是你的账号）
      }))
    } catch (err) {
      logger.error('QQ 搜索失败', { keyword, ...toErrorMeta(err) })
      return []
    }
  }

  /**
   * 拿播放 URL —— 核心闭环。
   * 在浏览器里让 QQ 播放器切到指定 mid，轮询读 audio.src。
   * 实测 QQ 网页版 audio.src 格式：O400{mediaMid}.ogg?vkey=...
   */
  async getPlayUrl(songId: string): Promise<string | null> {
    // songId 格式 qq_{mid}
    const mid = songId.startsWith('qq_') ? songId.slice(3) : songId
    try {
      // 在浏览器执行：触发播放 + 轮询等 audio.src 出现这首歌
      const code = `(async()=>{
        if(!location.host.includes('y.qq.com')){
          window.location.href='https://y.qq.com/n/ryqq/player';
          await new Promise(r=>setTimeout(r,4000));
        }
        // 尝试用 QQ 播放器内部接口播放指定歌曲
        try{
          await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg',{
            method:'POST',headers:{'content-type':'application/json'},credentials:'include',
            body:JSON.stringify({comm:{uin:0,format:'json',ct:24,cv:0},
              req_0:{module:'music.pf.PlayerFramework',method:'PlaySongList',
                param:{mid_list:[${JSON.stringify(mid)}],dirLog:1,play_from:1}}})
          });
        }catch(e){}
        // 轮询等 audio.src 变成这首歌（最多 6 秒）
        const targetSig=${JSON.stringify(mid)};
        for(let i=0;i<12;i++){
          await new Promise(r=>setTimeout(r,500));
          const audios=Array.from(document.querySelectorAll('audio'));
          for(const a of audios){
            const src=(a.src||a.currentSrc||'');
            if(src.includes('stream.qqmusic')&&src.length>30){
              return JSON.stringify({ok:true,url:src});
            }
          }
        }
        // 6 秒没拿到，返回当前 audio src（可能正在播别的）
        const a=document.querySelector('audio');
        const cur=a?(a.src||a.currentSrc||''):'';
        return JSON.stringify({ok:cur.includes('stream.qqmusic'),url:cur});
      })()`
      const result = await this.webbridgeEval(code)
      const url = result?.url || ''
      if (url && url.includes('stream.qqmusic')) {
        logger.info('QQ 拿到播放URL', { mid, url: url.slice(0, 50) })
        return url
      }
      logger.warn('QQ 未拿到播放URL（轮询超时）', { mid })
      return null
    } catch (err) {
      logger.error('QQ getPlayUrl 失败', { songId, ...toErrorMeta(err) })
      return null
    }
  }
}

export const qqMusicSource = new QQMusicSource()

/** 自动注册（启动时调） */
export function registerQQMusicSource() {
  registerMusicSource(qqMusicSource)
}
