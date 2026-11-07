import { formatTypedTime, parseTypedTime } from "@/lib/time-input";

describe("formatTypedTime", () => {
  it("mette i due punti da solo con quattro cifre", () => {
    expect(formatTypedTime("1450")).toBe("14:50");
    expect(formatTypedTime("145")).toBe("145");
    expect(formatTypedTime("14")).toBe("14");
  });
  it("accetta punto o virgola come separatore e scarta il resto", () => {
    expect(formatTypedTime("14.50")).toBe("14:50");
    expect(formatTypedTime("9,5")).toBe("9:5");
    expect(formatTypedTime("14h50x")).toBe("14:50");
    expect(formatTypedTime("14:505")).toBe("14:50");
  });
});

describe("parseTypedTime", () => {
  it("legge i formati comuni", () => {
    expect(parseTypedTime("14:50")).toEqual({ hour: 14, minute: 50 });
    expect(parseTypedTime("1450")).toEqual({ hour: 14, minute: 50 });
    expect(parseTypedTime("950")).toEqual({ hour: 9, minute: 50 });
    expect(parseTypedTime("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTypedTime("9:5")).toEqual({ hour: 9, minute: 5 });
    expect(parseTypedTime("14.50")).toEqual({ hour: 14, minute: 50 });
    expect(parseTypedTime("8")).toEqual({ hour: 8, minute: 0 });
  });
  it("rifiuta orari impossibili o incompleti", () => {
    expect(parseTypedTime("")).toBeNull();
    expect(parseTypedTime("14:")).toBeNull();
    expect(parseTypedTime("14:60")).toBeNull();
    expect(parseTypedTime("25:00")).toBeNull();
    expect(parseTypedTime("24:30")).toBeNull();
    expect(parseTypedTime("24:00")).toBeNull();
  });
  it("rispetta i limiti inclusivi", () => {
    const bounds = { min: { hour: 6, minute: 0 }, max: { hour: 24, minute: 0 } };
    expect(parseTypedTime("05:50", bounds)).toBeNull();
    expect(parseTypedTime("06:00", bounds)).toEqual({ hour: 6, minute: 0 });
    expect(parseTypedTime("24:00", bounds)).toEqual({ hour: 24, minute: 0 });
  });
});
