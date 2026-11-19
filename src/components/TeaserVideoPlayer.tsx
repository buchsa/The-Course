import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { EVENT_INFO } from '../data/eventData';

type VideoTrack = 'teaser' | 'grounds';

export function TeaserVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTrack, setActiveTrack] = useState<VideoTrack>('teaser');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  const currentSrc =
    activeTrack === 'teaser' ? EVENT_INFO.videoPath : EVENT_INFO.venueVideoPath;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration && !Number.isNaN(video.duration)) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setProgress(0);
    video.load();
    void video.play().catch(() => {
      setIsPlaying(false);
    });
  }, [activeTrack]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (video.paused) {
      void video.play();
    }
  };

  return (
    <div className="relative flex flex-col justify-between bg-[#0E3B24] rounded-2xl p-4 sm:p-5 text-[#FAF8F3] border border-[#C5A246]/30 shadow-sm h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div
          className="inline-flex items-center p-1 rounded-lg bg-white/10"
          role="tablist"
          aria-label="Event preview videos"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTrack === 'teaser'}
            onClick={() => setActiveTrack('teaser')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTrack === 'teaser'
                ? 'bg-[#E2CB7A] text-[#0E3B24]'
                : 'text-white/85 hover:text-white'
            }`}
          >
            Launch Teaser
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTrack === 'grounds'}
            onClick={() => setActiveTrack('grounds')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTrack === 'grounds'
                ? 'bg-[#E2CB7A] text-[#0E3B24]'
                : 'text-white/85 hover:text-white'
            }`}
          >
            Grounds & RC Track
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E2CB7A]"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{isMuted ? 'Sound Off' : 'Sound On'}</span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E2CB7A] hover:bg-[#d5bc63] text-[#0E3B24] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
        </div>
      </div>

      <div className="relative my-3 flex items-center justify-center bg-[#082415] rounded-xl overflow-hidden border border-white/10 h-[430px] sm:h-[460px]">
        <video
          ref={videoRef}
          src={currentSrc}
          poster={EVENT_INFO.logoPath}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        />
      </div>

      <div className="space-y-2">
        <div className="h-1 w-full bg-white/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E2CB7A] transition-[width] duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-4 text-xs text-white/75">
          <span className="truncate">
            {activeTrack === 'teaser'
              ? 'Official Launch Teaser · Click video to pause'
              : 'Stage Catwalk · Petrol RC Oval · Putting & Poker Lawn'}
          </span>
          <span className="text-[#E2CB7A] whitespace-nowrap shrink-0">Entebbe Golf Club</span>
        </div>
      </div>
    </div>
  );
}
