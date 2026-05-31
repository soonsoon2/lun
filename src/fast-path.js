/**
 * Local fast-path answers — trivial inputs (greetings, basic arithmetic) that
 * don't need to spend a model round-trip. Returns a string answer, or null to
 * fall through to the agents.
 */
export function localFastPath(text) {
  const normalized = text.trim();
  const compact = normalized.replace(/\s+/g, "");
  if (/^(안녕|안녕하세요|하이|hello|hi|hey)[!.?。！ㅋㅎ\s]*$/i.test(normalized)) {
    return "안녕하세요! 무엇을 도와드릴까요?";
  }

  const math = compact.match(/^(-?\d+(?:\.\d+)?)([+\-*/×÷])(-?\d+(?:\.\d+)?)(?:이야|인가|은|는|=|\?)*$/);
  if (math) {
    const a = Number(math[1]);
    const b = Number(math[3]);
    const op = math[2];
    let value;
    if (op === "+") value = a + b;
    else if (op === "-") value = a - b;
    else if (op === "*" || op === "×") value = a * b;
    else if (op === "/" || op === "÷") value = b === 0 ? "0으로는 나눌 수 없어요." : a / b;
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
    return value;
  }

  return null;
}
