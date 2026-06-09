import confetti from 'canvas-confetti';

/** Brief burst of confetti for milestone celebrations (growth, network, etc.). */
export function fireCelebrationConfetti(): void {
  const duration = 2000;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      zIndex: 9999,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      zIndex: 9999,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    zIndex: 9999,
  });

  frame();
}

/** @deprecated Use fireCelebrationConfetti */
export const fireRoadmapConfetti = fireCelebrationConfetti;
