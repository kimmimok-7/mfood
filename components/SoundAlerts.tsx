"use client"

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase-client'

// 간단한 사운드 알림 컴포넌트: 사용자 제스처로 활성화 후, 'pos:new-order' 이벤트에 반응해 소리를 재생합니다.
// - 우선순위: notify.mp3가 있으면 사용, 없거나 재생 불가 시 Web Audio 비프음 폴백
export default function SoundAlerts() {
  const [enabled, setEnabled] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // MP3 시도 + 폴백 준비
  useEffect(() => {
    // MP3 엘리먼트 준비 (존재 여부는 재생 시점에 판별)
    // 안전하게 브라우저의 Audio 생성자가 존재하는 경우만 인스턴스화
    try {
      if (typeof window !== 'undefined' && typeof (window as any).Audio !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AnyAudio: any = (window as any).Audio
        // Some environments (rare) expose Audio but not as a constructible; guard with try
        try {
          audioRef.current = new AnyAudio('/images/notify.mp3')
        } catch (err) {
          // not constructible -> leave audioRef null and rely on WebAudio fallback
          audioRef.current = null
        }
      }
    } catch {
      audioRef.current = null
    }
    // 서버 설정 + 로컬 저장값 반영
    (async () => {
      try {
        const client = supabase()
  // read settings without depending on legacy id
  const { data } = await client.from('restaurant_settings').select('enable_new_order_sound').limit(1).maybeSingle()
        const serverEnabled = data?.enable_new_order_sound !== false // default true
        const local = typeof window !== 'undefined' ? localStorage.getItem('pos:sound-enabled') : null
        const localEnabled = local === '1'
        setEnabled(serverEnabled && localEnabled)
      } catch {
        // fallback to local only
        const local = typeof window !== 'undefined' ? localStorage.getItem('pos:sound-enabled') : null
        setEnabled(local === '1')
      }
    })()
  }, [])

  // 비프음(폴백) 재생기
  const beep = async (durationMs = 500, freq = 880) => {
    try {
      if (!audioCtxRef.current) return
      const ctx = audioCtxRef.current
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = freq
      // 간단한 엔벨로프 (빠른 attack, 빠른 release)
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01)
      gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(now + durationMs / 1000)
    } catch {
      // noop
    }
  }

  useEffect(() => {
    const handler = async () => {
      if (!enabled) return
      // 우선 MP3 재생 시도
      let played = false
      try {
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          await audioRef.current.play()
          played = true
        }
      } catch {
        played = false
      }
      // 실패 시 폴백 비프
      if (!played) {
        await beep(500, 880)
      }
    }
    window.addEventListener('pos:new-order', handler)
    return () => window.removeEventListener('pos:new-order', handler)
  }, [enabled])

  const enableSound = async () => {
    try {
      // 사용자 제스처에서 오디오 컨텍스트 unlock
      if (!audioCtxRef.current) {
        // @ts-ignore - Safari 호환
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        audioCtxRef.current = new Ctx()
      }
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
    } catch {
      // noop
    }
    // 서버 설정이 꺼져있으면 켜지 않음
    try {
      const client = supabase()
  const { data } = await client.from('restaurant_settings').select('enable_new_order_sound').limit(1).maybeSingle()
      if (data?.enable_new_order_sound === false) {
        window.dispatchEvent(new CustomEvent('notify', { detail: { type: 'warning', message: '설정에서 새 주문 사운드가 비활성화되어 있습니다.' } }))
        return
      }
    } catch {}
    setEnabled(true)
    if (typeof window !== 'undefined') localStorage.setItem('pos:sound-enabled', '1')
    // 활성화 피드백 비프 짧게
    await beep(200, 1200)
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40">
      {!enabled && (
        <button
          onClick={enableSound}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white shadow"
          title="새 주문 알림 소리를 활성화하려면 클릭하세요"
        >
          새 주문 소리 켜기
        </button>
      )}
    </div>
  )
}
