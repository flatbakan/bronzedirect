// state.js — Lítið sameiginlegt ástand milli eininga (t.d. forfylling forma).
export const prefill = {
  value: null,       // t.d. { customerId }
  take() { const v = this.value; this.value = null; return v; },
  set(v) { this.value = v; },
};
