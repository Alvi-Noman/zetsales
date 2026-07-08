// Code 128 (subset B) width table — 106 symbol values, each an 11-module bar/space width
// sequence (13 modules for the stop pattern). This is the public, standard barcode encoding;
// implementing it directly means courier labels get a real scannable barcode with no external
// dependency or network fetch.
const CODE128_WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232',
];
const STOP_WIDTH = '2331112';
const START_B = 104;
const STOP = 106;

export interface BarcodeBar {
  x: number;
  width: number;
}

// Encodes `text` (printable ASCII only — the range covered by charset B) as Code128B, returning
// bar x-positions/widths in "module" units (1 module = the narrowest bar) so the caller can scale
// to real px/mm. Characters outside ASCII 32-126 are skipped rather than thrown on, since a
// courier tracking code is never expected to contain one.
export function encodeCode128B(text: string): { bars: BarcodeBar[]; totalModules: number } {
  const values: number[] = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    values.push(code - 32);
  }
  let checksum = values[0];
  for (let i = 1; i < values.length; i++) checksum += values[i] * i;
  values.push(checksum % 103);
  values.push(STOP);

  const bars: BarcodeBar[] = [];
  let cursor = 0;
  values.forEach((value) => {
    const widths = (value === STOP ? STOP_WIDTH : CODE128_WIDTHS[value]).split('').map(Number);
    widths.forEach((w, i) => {
      const isBar = i % 2 === 0; // Each symbol alternates bar, space, bar, space... starting with a bar
      if (isBar) bars.push({ x: cursor, width: w });
      cursor += w;
    });
  });
  return { bars, totalModules: cursor };
}
