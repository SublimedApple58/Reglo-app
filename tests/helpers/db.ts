type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const createPrismaMock = <T extends object>(value: DeepPartial<T>) =>
  value as T;

export const asAsync = <T>(value: T) => Promise.resolve(value);
