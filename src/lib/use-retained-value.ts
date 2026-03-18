import { useEffect, useRef } from "react";

export function useRetainedValue<T>(value: T | undefined): T | undefined {
  const retainedValueRef = useRef<T | undefined>(value);

  useEffect(() => {
    if (value !== undefined) {
      retainedValueRef.current = value;
    }
  }, [value]);

  return value ?? retainedValueRef.current;
}
