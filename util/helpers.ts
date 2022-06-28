export function classNames(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}

export function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
