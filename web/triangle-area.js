const bits = new DataView(new ArrayBuffer(8));

function hasReliableDifference(left, right) {
  // Account for rounding in both edge differences and products. Uncertain
  // determinants go through the exact path, including subnormal products.
  const magnitude = Math.abs(left) + Math.abs(right);
  const error = Math.max(Number.MIN_VALUE * 8, magnitude * (Number.EPSILON * 8));
  return Math.abs(left - right) > error;
}

export function isZeroAreaTriangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const x = bx - ax, y = by - ay, z = bz - az;
  const u = cx - ax, v = cy - ay, w = cz - az;
  if (hasReliableDifference(y * w, z * v)
      || hasReliableDifference(z * u, x * w)
      || hasReliableDifference(x * v, y * u)) return false;
  const coordinates = [ax, ay, az, bx, by, bz, cx, cy, cz];
  if (!coordinates.every(Number.isFinite)) return false;
  if ((!x && !y && !z) || (!u && !v && !w) || (bx === cx && by === cy && bz === cz)) return true;

  let minimum = Infinity;
  const parts = coordinates.map(value => {
    bits.setFloat64(0, value, true);
    const encoded = bits.getBigUint64(0, true);
    const exponentBits = Number(encoded >> 52n & 2047n);
    const mantissa = (encoded & 4503599627370495n) | (exponentBits ? 4503599627370496n : 0n);
    const exponent = exponentBits ? exponentBits - 1075 : -1074;
    if (mantissa) minimum = Math.min(minimum, exponent);
    return { mantissa: encoded >> 63n ? -mantissa : mantissa, exponent };
  });
  const p = parts.map(({ mantissa, exponent }) => mantissa ? mantissa << BigInt(exponent - minimum) : 0n);
  const dx = p[3] - p[0], dy = p[4] - p[1], dz = p[5] - p[2];
  const du = p[6] - p[0], dv = p[7] - p[1], dw = p[8] - p[2];
  return dy * dw === dz * dv && dz * du === dx * dw && dx * dv === dy * du;
}
