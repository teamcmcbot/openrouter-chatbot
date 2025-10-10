"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface CarouselImage {
  src: string;
  alt: string;
}

interface HeroCarouselProps {
  images: CarouselImage[];
  interval?: number; // milliseconds between transitions
}

export default function HeroCarousel({ images, interval = 4000 }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
  }, [images.length]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Auto-advance carousel
  useEffect(() => {
    if (isPaused || images.length <= 1) return;

    const timer = setInterval(nextSlide, interval);
    return () => clearInterval(timer);
  }, [isPaused, interval, nextSlide, images.length]);

  if (images.length === 0) return null;

  return (
    <div
      className="relative w-full aspect-square"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Images */}
      <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl ring-1 ring-emerald-500/20 dark:ring-emerald-400/30">
        {images.map((image, index) => (
          <div
            key={image.src}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              className="object-cover"
              priority={index === 0}
              quality={90}
              sizes="(max-width: 1024px) 0px, (max-width: 1280px) 40vw, 35vw"
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`transition-all duration-300 rounded-full ${
                index === currentIndex
                  ? "w-8 h-2 bg-emerald-600 dark:bg-emerald-400"
                  : "w-2 h-2 bg-slate-300 dark:bg-gray-600 hover:bg-slate-400 dark:hover:bg-gray-500"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
