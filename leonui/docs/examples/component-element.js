/* A distributable component: a custom element whose markup is leonui.
 * Page authors write <x-counter start="5" label="votes"></x-counter> — that's it. */
import { attach, coerce, scopes, sig } from '/dist/leonui.js';

class XCounter extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label') ?? 'count';
    const start = coerce(this.getAttribute('start') ?? '0');
    this.innerHTML = `
      <span class="ui-badge ui-b-brand" ui:bind="text: label"></span>
      <b ui:bind="text: ' ' + n"></b>
      <button class="ui-btn" style="margin-left:6px" ui:fx="click: set n = n + 1">+1</button>`;
    const scope = { signals: new Map([['n', sig(start)], ['label', sig(label)]]), meta: new Map() };
    scopes.set(this, scope);
    attach(this);
  }
}
customElements.define('x-counter', XCounter);
