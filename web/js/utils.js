"use strict";

const $ = (id) => document.getElementById(id);

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function nowMs() {
  return Date.now();
}

function todayString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function int(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mergeResources(target, source) {
  for (const id of Object.keys(source)) {
    target[id] = num(target[id]) + num(source[id]);
  }
}

function formatInt(value) {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(2) + "亿";
  if (abs >= 10000) return (n / 10000).toFixed(2) + "万";
  return String(Math.round(n));
}

function formatDuration(minutes) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}时${m}分` : `${h}个时辰`;
  }
  return `${minutes}分钟`;
}
