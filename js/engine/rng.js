// ── Seeded randomness ────────────────────────────────────────
// The simulator must be repeatable: the same scenario and seed give the
// same run, which is what lets the redline search bisect on user count
// without noise flipping the answer between probes.

/** mulberry32: small, fast, good enough for workload sampling. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Exponential with the given mean (think times, arrivals). */
    exp(mean) {
      if (mean <= 0) return 0;
      return -Math.log(1 - next()) * mean;
    },
    /** Standard normal via Box-Muller. */
    normal() {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    /**
     * Lognormal parameterised by its mean and coefficient of variation, which
     * is how token counts are described in practice ("about 300, varies a lot").
     */
    lognormal(mean, cv = 0.5) {
      if (mean <= 0) return 0;
      if (cv <= 0) return mean;
      const s2 = Math.log(1 + cv * cv);
      const mu = Math.log(mean) - s2 / 2;
      return Math.exp(mu + Math.sqrt(s2) * this.normal());
    },
    /** Uniform in [lo, hi). */
    range(lo, hi) { return lo + (hi - lo) * next(); },
    chance(p) { return next() < p; },
  };
}

/** Stable 32-bit hash of a string, for deriving per-group seeds. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Percentile of an unsorted numeric array (linear interpolation). */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort();
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
