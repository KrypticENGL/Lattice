"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Frame, HeapObject } from "@/lib/trace-schema/types";
import { mentionedAddresses } from "@/lib/simulator/pointers";
import { addressLabels, shortAddress } from "@/lib/simulator/values";

/**
 * How an address is written, for one step of a trace.
 *
 * A pointer's label is only useful if it can be matched to the card it
 * names, and whether a given truncation manages that is a fact about the
 * whole step, not about the one address being drawn — see
 * `addressLabels`. So the answer is computed once per step and read from
 * context, rather than each pill deciding for itself and the three panels
 * quietly disagreeing about how many digits a pointer has.
 *
 * The default is the context-free truncation, so a pill rendered outside
 * a step still renders something.
 */
const AddressLabelContext = createContext<(address: string) => string>(shortAddress);

export function AddressLabels({
  frames,
  heap,
  children,
}: {
  frames: Frame[];
  heap: Record<string, HeapObject>;
  children: ReactNode;
}) {
  // Keyed to the step's own data, so typing in the editor — which
  // re-renders the page but changes neither — doesn't hand the memoised
  // panels below a new context value and undo their memoisation.
  const label = useMemo(() => {
    const labels = addressLabels(mentionedAddresses(frames, heap));
    return (address: string) => labels.get(address) ?? shortAddress(address);
  }, [frames, heap]);

  return <AddressLabelContext.Provider value={label}>{children}</AddressLabelContext.Provider>;
}

export function useAddressLabel(): (address: string) => string {
  return useContext(AddressLabelContext);
}
