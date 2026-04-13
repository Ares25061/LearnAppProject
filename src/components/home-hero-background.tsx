"use client";

import { useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

let particlesInitPromise: Promise<void> | null = null;

function ensureParticlesEngine() {
  if (!particlesInitPromise) {
    particlesInitPromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }

  return particlesInitPromise;
}

export function HomeHeroBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    ensureParticlesEngine().then(() => {
      if (active) {
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const options = useMemo<ISourceOptions>(
    () => ({
      fullScreen: {
        enable: false,
      },
      background: {
        color: "transparent",
      },
      detectRetina: true,
      fpsLimit: 60,
      interactivity: {
        events: {
          onClick: {
            enable: false,
          },
          onHover: {
            enable: false,
          },
          resize: {
            enable: true,
          },
        },
      },
      particles: {
        color: {
          value: ["#0b7a75", "#16425b", "#bc6c25", "#8aa79d"],
        },
        links: {
          enable: true,
          color: "#8faea4",
          distance: 150,
          opacity: 0.34,
          width: 1.2,
        },
        move: {
          enable: true,
          speed: 0.75,
          direction: "none",
          outModes: {
            default: "bounce",
          },
        },
        number: {
          density: {
            enable: true,
            width: 1200,
            height: 700,
          },
          value: 52,
        },
        opacity: {
          value: {
            min: 0.22,
            max: 0.56,
          },
          animation: {
            enable: true,
            speed: 0.8,
            sync: false,
          },
        },
        shape: {
          type: "circle",
        },
        size: {
          value: {
            min: 2,
            max: 7,
          },
        },
      },
    }),
    [],
  );

  if (!ready) {
    return null;
  }

  return (
    <div aria-hidden="true" className="home-hero__particles">
      <Particles className="home-hero__particles-canvas" id="home-hero-particles" options={options} />
    </div>
  );
}
