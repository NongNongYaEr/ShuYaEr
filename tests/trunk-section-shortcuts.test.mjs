import test from 'node:test';
import assert from 'node:assert/strict';
import { trunkSectionShortcut } from '../web/trunk-section-shortcuts.js';

const enabled = { enabled: true };
const event = (key, extra = {}) => ({ key, ...extra });

test('section shortcuts belong only to the explicit form context', () => {
  for (const key of ['g', 'r', 's', 'c', 'n', 'Delete', 'f', 'p', 'v', 'Escape', 'Enter', 'PageUp', '[']) {
    assert.equal(trunkSectionShortcut(event(key)), null, key);
    assert.equal(trunkSectionShortcut(event(key), { active: true }), null, key);
  }
  assert.equal(trunkSectionShortcut(), null);
  assert.equal(trunkSectionShortcut({}, enabled), null);
});

test('normal section commands keep familiar transforms and explicit add/remove semantics', () => {
  for (const [key, action] of [
    ['g', 'SLIDE'], ['R', 'TWIST'], ['s', 'RADIUS'], ['C', 'PROFILE'],
    ['n', 'ADD'], ['Delete', 'REMOVE'], ['f', 'FOCUS'], ['p', 'PRESETS'], ['v', 'EXIT'],
  ]) assert.equal(trunkSectionShortcut(event(key), enabled), action);
  assert.equal(trunkSectionShortcut(event('s', { altKey: true }), enabled), 'RADIUS');
  assert.equal(trunkSectionShortcut(event('g', { altKey: true }), enabled), 'SLIDE');
  assert.equal(trunkSectionShortcut(event('r', { altKey: true }), enabled), 'TWIST');
  assert.equal(trunkSectionShortcut(event('P', { shiftKey: true }), enabled), 'SAVE_PRESET');
  // Code-only synthetic events are useful in controller tests; a real key
  // value has priority so a mismatched code does not reinterpret typed input.
  assert.equal(trunkSectionShortcut({ code: 'KeyG' }, enabled), 'SLIDE');
  assert.equal(trunkSectionShortcut({ key: 'b', code: 'KeyG' }, enabled), null);
});

test('Shift+D duplicates only in the explicit section context and is never allowed to repeat', () => {
  const duplicate = event('D', { shiftKey: true });
  assert.equal(trunkSectionShortcut(duplicate, enabled), 'DUPLICATE');
  assert.equal(trunkSectionShortcut({ code: 'KeyD', shiftKey: true }, enabled), 'DUPLICATE');
  assert.equal(trunkSectionShortcut(event('d'), enabled), null);
  assert.equal(trunkSectionShortcut(duplicate), null);
  assert.equal(trunkSectionShortcut(duplicate, { active: true }), null);
  assert.equal(trunkSectionShortcut(duplicate, { ...enabled, typing: true, active: true }), null);
  assert.equal(trunkSectionShortcut(duplicate, { ...enabled, dialogOpen: true }), null);
  for (const blocker of ['ctrlKey', 'metaKey', 'altKey', 'repeat', 'isComposing', 'defaultPrevented']) {
    assert.equal(trunkSectionShortcut({ ...duplicate, [blocker]: true }, enabled), null, blocker);
  }
  // A mismatched key value must not reinterpret ordinary typing as duplication.
  assert.equal(trunkSectionShortcut({ key: 'x', code: 'KeyD', shiftKey: true }, enabled), null);
});

test('text editing allows only cancelling an already active section gesture', () => {
  const typing = { ...enabled, typing: true }, active = { ...typing, active: true };
  for (const key of ['g', 's', 'Delete', 'Enter', 'p', '[', ']']) {
    assert.equal(trunkSectionShortcut(event(key), typing), null);
    assert.equal(trunkSectionShortcut(event(key), active), null);
  }
  assert.equal(trunkSectionShortcut(event('Escape'), typing), null);
  assert.equal(trunkSectionShortcut(event('Escape'), active), 'CANCEL');
  for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey', 'repeat']) {
    assert.equal(trunkSectionShortcut(event('Escape', { [modifier]: true }), active), null, modifier);
  }
});

test('dialogs, handled events and IME suppress destructive and navigation commands alike', () => {
  for (const key of ['Delete', 'n', 'g', 'Enter', 'Escape', 'PageDown']) {
    assert.equal(trunkSectionShortcut(event(key), { ...enabled, active: true, dialogOpen: true }), null);
    assert.equal(trunkSectionShortcut(event(key, { isComposing: true }), { ...enabled, active: true }), null);
    assert.equal(trunkSectionShortcut(event(key, { defaultPrevented: true }), { ...enabled, active: true }), null);
  }
});

test('global save, undo, redo, copy and platform modifiers are never claimed by section editing', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    for (const key of ['s', 'z', 'y', 'c', 'v', 'p', 'Enter', 'Escape', 'Delete']) {
      assert.equal(trunkSectionShortcut(event(key, { [modifier]: true }), { ...enabled, active: true }), null);
      assert.equal(trunkSectionShortcut(event(key, { [modifier]: true, shiftKey: true }), enabled), null);
    }
  }
});

test('only declared modifier aliases are accepted', () => {
  for (const key of ['c', 'n', 'Delete', 'f', 'v', 'Escape', 'Enter', 'PageUp', '[']) {
    assert.equal(trunkSectionShortcut(event(key, { shiftKey: true }), { ...enabled, active: true }), null);
    assert.equal(trunkSectionShortcut(event(key, { altKey: true }), { ...enabled, active: true }), null);
  }
  assert.equal(trunkSectionShortcut(event('s', { shiftKey: true }), enabled), null);
  assert.equal(trunkSectionShortcut(event('p', { altKey: true }), enabled), null);
  assert.equal(trunkSectionShortcut(event('s', { altKey: true, shiftKey: true }), enabled), null);
  assert.equal(trunkSectionShortcut(event('p', { altKey: true, shiftKey: true }), enabled), null);
});

test('Escape is routed in the form context but Enter confirms only an active gesture', () => {
  assert.equal(trunkSectionShortcut(event('Escape'), enabled), 'ESCAPE');
  assert.equal(trunkSectionShortcut(event('Escape'), { ...enabled, active: true }), 'ESCAPE');
  assert.equal(trunkSectionShortcut(event('Enter'), enabled), null);
  assert.equal(trunkSectionShortcut(event('Enter'), { ...enabled, active: true }), 'CONFIRM');
});

test('only previous/next section navigation may repeat; held edit commands cannot accumulate', () => {
  for (const [key, action] of [['PageUp', 'PREVIOUS'], ['[', 'PREVIOUS'], ['PageDown', 'NEXT'], [']', 'NEXT']]) {
    assert.equal(trunkSectionShortcut(event(key), enabled), action);
    assert.equal(trunkSectionShortcut(event(key, { repeat: true }), enabled), action);
  }
  for (const key of ['g', 'r', 's', 'c', 'n', 'Delete', 'f', 'p', 'v', 'Escape', 'Enter']) {
    assert.equal(trunkSectionShortcut(event(key, { repeat: true }), { ...enabled, active: true }), null);
  }
  assert.equal(trunkSectionShortcut(event('s', { altKey: true, repeat: true }), enabled), null);
  assert.equal(trunkSectionShortcut(event('p', { shiftKey: true, repeat: true }), enabled), null);
});
