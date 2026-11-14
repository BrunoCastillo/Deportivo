import { describe, expect, it } from "vitest";
import { CORNER_X, CORNER_Y, COURT_H, COURT_W, RIM, THREE_R, isThree, zoneOf, ZONE_CENTER, ZONES } from "./court";

/** meters → normalized */
const n = (X: number, Y: number): [number, number] => [X / COURT_W, Y / COURT_H];

describe("court geometry constants", () => {
  it("corner line meets the arc at ≈2.99 m", () => {
    expect(CORNER_Y).toBeCloseTo(1.575 + Math.sqrt(6.75 ** 2 - 6.6 ** 2), 10);
    expect(CORNER_Y).toBeCloseTo(2.99, 2);
    // the arc and the corner line meet continuously
    expect(Math.hypot(CORNER_X, CORNER_Y - RIM.y)).toBeCloseTo(THREE_R, 10);
  });
});

describe("isThree", () => {
  it("corner 3 vs corner 2 just inside 6.6 m (left and right)", () => {
    expect(isThree(...n(RIM.x - 6.65, 1.0))).toBe(true);
    expect(isThree(...n(RIM.x - 6.55, 1.0))).toBe(false);
    expect(isThree(...n(RIM.x + 6.65, 1.0))).toBe(true);
    expect(isThree(...n(RIM.x + 6.55, 1.0))).toBe(false);
    // on the baseline, behind the rim plane
    expect(isThree(...n(0.3, 0))).toBe(true);
    expect(isThree(...n(1.0, 0.2))).toBe(false); // 6.5 m lateral
  });

  it("top of key: 6.7 m is a 2, 6.8 m is a 3", () => {
    expect(isThree(...n(RIM.x, RIM.y + 6.7))).toBe(false);
    expect(isThree(...n(RIM.x, RIM.y + 6.8))).toBe(true);
  });

  it("wing at 45°: 6.7 m is a 2, 6.8 m is a 3", () => {
    const d = (r: number) => r / Math.SQRT2;
    expect(isThree(...n(RIM.x - d(6.7), RIM.y + d(6.7)))).toBe(false);
    expect(isThree(...n(RIM.x - d(6.8), RIM.y + d(6.8)))).toBe(true);
    expect(isThree(...n(RIM.x + d(6.8), RIM.y + d(6.8)))).toBe(true);
  });

  it("just above the corner break the arc applies (6.6 m lateral is inside the arc there)", () => {
    // Y = 3.5 m: required lateral distance = sqrt(6.75² − 1.925²) ≈ 6.47 m
    expect(isThree(...n(RIM.x - 6.5, 3.5))).toBe(true);
    expect(isThree(...n(RIM.x - 6.4, 3.5))).toBe(false);
  });

  it("deep shots are threes, layups are twos", () => {
    expect(isThree(0.5, 0.95)).toBe(true);
    expect(isThree(0.5, 0.12)).toBe(false);
  });
});

describe("zoneOf", () => {
  it("corners", () => {
    expect(zoneOf(...n(0.5, 1.0))).toBe("corner3_left");
    expect(zoneOf(...n(14.5, 1.0))).toBe("corner3_right");
    // corner 2 just inside the line → mid range on that side
    expect(zoneOf(...n(RIM.x - 6.55, 1.0))).toBe("mid_left");
    expect(zoneOf(...n(RIM.x + 6.55, 1.0))).toBe("mid_right");
  });

  it("top of key and wings beyond the arc", () => {
    expect(zoneOf(...n(RIM.x, RIM.y + 6.8))).toBe("top3");
    expect(zoneOf(...n(RIM.x, RIM.y + 6.7))).toBe("mid_center");
    const d = 6.9 / Math.SQRT2;
    expect(zoneOf(...n(RIM.x - d, RIM.y + d))).toBe("wing3_left");
    expect(zoneOf(...n(RIM.x + d, RIM.y + d))).toBe("wing3_right");
  });

  it("paint", () => {
    expect(zoneOf(...n(RIM.x, RIM.y))).toBe("paint");
    expect(zoneOf(...n(RIM.x - 2.4, 5.7))).toBe("paint");
    expect(zoneOf(...n(RIM.x + 2.4, 0.2))).toBe("paint");
  });

  it("mid-range zones", () => {
    // just outside the lane, low
    expect(zoneOf(...n(RIM.x - 2.6, 2.0))).toBe("mid_left");
    expect(zoneOf(...n(RIM.x + 2.6, 2.0))).toBe("mid_right");
    // above the FT line, centered → mid_center
    expect(zoneOf(...n(RIM.x, 6.5))).toBe("mid_center");
    // 45° elbow-extended 5 m → side mid
    expect(zoneOf(...n(RIM.x - 3.5, RIM.y + 3.5))).toBe("mid_left");
  });

  it("ZONE_CENTER points map to their own zone", () => {
    for (const z of ZONES) expect(zoneOf(ZONE_CENTER[z].x, ZONE_CENTER[z].y)).toBe(z);
  });
});
