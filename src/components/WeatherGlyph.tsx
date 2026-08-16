import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "lucide-react";
import type { WeatherIconKey } from "@/lib/weather";

const WEATHER_ICONS: Record<WeatherIconKey, typeof Cloud> = {
  sun: Sun,
  moon: Moon,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  cloud: Cloud,
  "cloud-fog": CloudFog,
  "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain,
  "cloud-snow": CloudSnow,
  "cloud-lightning": CloudLightning,
};

export function WeatherGlyph({ icon, className }: { icon: WeatherIconKey; className?: string }) {
  const Icon = WEATHER_ICONS[icon];
  return <Icon className={className} aria-hidden />;
}
