export function element(className: string, parent: HTMLElement, tag = 'div') {
  const el = document.createElement(tag);
  el.className = className;
  parent.append(el);
  return el;
}
