export function inputError(message) {
  return Object.assign(new Error(message), { status: 400 });
}
