"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function TopLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPath = useRef(pathname + searchParams.toString());

  useEffect(() => {
    const current = pathname + searchParams.toString();
    if (current === prevPath.current) return;
    prevPath.current = current;

    // Navigation completed — finish the bar
    setWidth(100);
    const t = setTimeout(() => {
      setLoading(false);
      setWidth(0);
    }, 300);
    return () => clearTimeout(t);
  }, [pathname, searchParams]);

  // Detect clicks on internal links to start the bar immediately
  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto")) return;

      setLoading(true);
      setWidth(15);

      // Drip progress to give feedback while compiling
      let w = 15;
      timerRef.current = setInterval(() => {
        // Slow down as it gets closer to 85% (never reaches 100 — that happens on navigation complete)
        const step = w < 40 ? 8 : w < 65 ? 4 : w < 80 ? 1.5 : 0.3;
        w = Math.min(w + step, 85);
        setWidth(w);
      }, 300);
    }

    document.addEventListener("click", onLinkClick);
    return () => {
      document.removeEventListener("click", onLinkClick);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Clear interval when loading finishes
  useEffect(() => {
    if (!loading && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [loading]);

  if (!loading && width === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 z-[9999] h-[2px] transition-all duration-200 ease-out"
      style={{
        width: `${width}%`,
        background: "linear-gradient(90deg, #c084fc, #f59e0b, #c084fc)",
        boxShadow: "0 0 8px #c084fc88",
        opacity: loading || width < 100 ? 1 : 0,
      }}
    />
  );
}
