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

  // Auto-advance carousel
  useEffect(() => {
    if (isPaused || images.length <= 1) return;

    const timer = setInterval(nextSlide, interval);
    return () => clearInterval(timer);
  }, [isPaused, interval, nextSlide, images.length]);

  if (images.length === 0) return null;

  return (
    <div
      className="relative w-full aspect-[9/19]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Images */}
      <div className="relative w-full h-full rounded-xl overflow-hidden">
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
              className="object-contain"
              priority={index === 0}
              quality={95}
              sizes="(max-width: 640px) 200px, (max-width: 768px) 320px, (max-width: 1024px) 384px, 384px"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
