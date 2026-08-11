export const MIN_PASSPHRASE_LENGTH = 3;

export function isPassphraseLongEnough(value: string): boolean {
  return value.length >= MIN_PASSPHRASE_LENGTH;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return password === confirm;
}
