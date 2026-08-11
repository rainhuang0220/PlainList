import { describe, expect, it } from 'vitest';
import {
  createPasswordPromptGate,
  isPasswordEditKey,
} from './passwordPromptGate';

describe('createPasswordPromptGate', () => {
  it('rejects submit before arm', () => {
    const gate = createPasswordPromptGate();
    expect(gate.canSubmit()).toBe(false);
  });

  it('rejects submit after arm until touched (blocks autofill Enter)', () => {
    const gate = createPasswordPromptGate();
    gate.arm();
    expect(gate.canSubmit()).toBe(false);
  });

  it('allows submit after arm + real edit', () => {
    const gate = createPasswordPromptGate();
    gate.arm();
    gate.markTouched();
    expect(gate.canSubmit()).toBe(true);
  });

  it('re-arm clears touch so confirm step needs typing again', () => {
    const gate = createPasswordPromptGate();
    gate.arm();
    gate.markTouched();
    expect(gate.canSubmit()).toBe(true);

    gate.arm();
    expect(gate.canSubmit()).toBe(false);
    gate.markTouched();
    expect(gate.canSubmit()).toBe(true);
  });

  it('reset blocks submit until next arm+touch', () => {
    const gate = createPasswordPromptGate();
    gate.arm();
    gate.markTouched();
    gate.reset();
    expect(gate.canSubmit()).toBe(false);
  });
});

describe('isPasswordEditKey', () => {
  it('counts printable and paste, ignores bare Enter/Tab/meta combos', () => {
    expect(isPasswordEditKey({ key: 'a', metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(isPasswordEditKey({ key: 'Backspace', metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(isPasswordEditKey({ key: 'v', metaKey: true, ctrlKey: false, altKey: false })).toBe(true);
    expect(isPasswordEditKey({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isPasswordEditKey({ key: 'Tab', metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isPasswordEditKey({ key: 'a', metaKey: true, ctrlKey: false, altKey: false })).toBe(false);
  });
});
