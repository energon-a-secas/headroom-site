// ── Event queue ──────────────────────────────────────────────
// Binary min-heap on time. Ties break on insertion order so a run is
// deterministic for a given seed.

export function makeHeap() {
  const a = [];
  let seq = 0;
  const less = (x, y) => x.t < y.t || (x.t === y.t && x.s < y.s);
  return {
    get size() { return a.length; },
    peekTime() { return a.length ? a[0].t : Infinity; },
    push(ev) {
      ev.s = seq++;
      a.push(ev);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && less(a[l], a[m])) m = l;
          if (r < a.length && less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    },
  };
}
