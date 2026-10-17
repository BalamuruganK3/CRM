import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as Lucide from 'lucide-react';
import { api } from '../api';

const UiContext = createContext(null);

export function Icon({ name, size = 18 }) {
  if (!name) return null;
  const Glyph = Lucide[name];
  if (!Glyph) return null;
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" />;
}

export function UiProvider({ page, children }) {
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const [pageData, commonData] = await Promise.all([api.ui(page), api.ui('common')]);
    setElements([...commonData.elements, ...pageData.elements]);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload()
      .catch(() => {
        if (active) setElements([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const map = useMemo(() => {
    const next = {};
    for (const element of elements) {
      if (element.element_key) next[element.element_key] = element;
    }
    return next;
  }, [elements]);

  const value = useMemo(() => ({
    page,
    elements,
    map,
    loading,
    reload,
    text(key) {
      return map[key]?.content || '';
    },
  }), [page, elements, map, loading]);

  return <UiContext.Provider value={value}><ThemeStyle map={map} />{children}</UiContext.Provider>;
}

export function useUi() {
  return useContext(UiContext);
}

function ThemeStyle({ map }) {
  useEffect(() => {
    const root = document.documentElement;
    const paint = (token, key) => {
      const value = map[key]?.content || '';
      if (/^#[0-9a-fA-F]{3,8}$/.test(value)) root.style.setProperty(token, value);
    };
    paint('--accent', 'theme_accent');
    paint('--paper', 'theme_paper');
    paint('--ink', 'theme_ink');
    paint('--card', 'theme_card');
    const field = map.field_shape?.content;
    const button = map.button_shape?.content;
    if (['rectangle', 'rounded', 'pill'].includes(field)) root.dataset.fieldShape = field;
    if (['rectangle', 'rounded', 'pill'].includes(button)) root.dataset.buttonShape = button;
    root.style.removeProperty('--icon-size');
    root.style.removeProperty('--field-size');
  }, [map]);
  return null;
}

export function explain(code, text) {
  const keys = {
    LOGIN_REQUIRED: 'login_required',
    LOGIN_INVALID: 'login_invalid',
    VALIDATION: 'required',
    NEED_EMPLOYEE: 'need_employee',
    UPDATE_REQUIRED: 'update_required',
    DUPLICATE: 'duplicate_account',
    FILE: 'file_rejected',
    SERVER: 'generic_error',
    FORBIDDEN: 'generic_error',
    NOT_FOUND: 'generic_error',
    AUTH: 'generic_error',
  };
  return text(keys[code] || 'generic_error') || 'Something went wrong. Try again.';
}

const SHAPES = [
  ['', 'Default'],
  ['rectangle', 'Rectangle'],
  ['rounded', 'Rounded'],
  ['pill', 'Pill'],
  ['square', 'Square'],
  ['circle', 'Circle'],
  ['diamond', 'Diamond'],
];

function shapeClass(shape) {
  return shape ? `shape shape-${shape}` : '';
}

function ShapePicker({ value, onChange }) {
  return (
    <div className="shape-picker" role="group" aria-label="Shape">
      {SHAPES.map(([id, label]) => (
        <button
          type="button"
          key={label}
          className={value === id ? 'active' : ''}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <span className={`swatch ${id ? `shape-${id}` : 'shape-default'}`} />
          {label}
        </button>
      ))}
    </div>
  );
}

function placeDialog(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 16);
  const maxHeight = Math.min(440, window.innerHeight - 16);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
  if (left < 8) left = 8;
  let top = rect.bottom + 6;
  if (top + maxHeight > window.innerHeight - 8) top = Math.max(8, rect.top - maxHeight - 6);
  return { top, left, width, maxHeight: Math.min(maxHeight, window.innerHeight - top - 8) };
}

function EditDialog({ element, anchor, onClose, reload }) {
  const { text } = useUi();
  const [content, setContent] = useState(element.content);
  const [icon, setIcon] = useState(element.icon || '');
  const [shape, setShape] = useState(element.shape || '');
  const [iconSize, setIconSize] = useState(element.icon_size || 18);
  const [textSize, setTextSize] = useState(element.text_size || 16);
  const [error, setError] = useState('');
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    if (!anchor) return undefined;
    function position() {
      setBox(placeDialog(anchor));
    }
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [anchor]);

  async function save() {
    if (!content.trim()) {
      setError(text('required'));
      return;
    }
    await api.patchUi(element.id, { content, icon, shape, icon_size: Number(iconSize), text_size: Number(textSize) });
    await reload();
    onClose();
  }

  return (
    <div className="edit-dialog floating" style={box || undefined} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} />
      <label>
        Icon
        <input value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="Plus" />
      </label>
      <label>
        Icon size
        <input type="range" min="12" max="40" value={iconSize} onChange={(event) => setIconSize(Number(event.target.value))} />
        <span>{iconSize}px</span>
      </label>
      <label>
        Field size
        <input type="range" min="12" max="32" value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} />
        <span>{textSize}px</span>
      </label>
      <span className="picker-label">Shape</span>
      <ShapePicker value={shape} onChange={setShape} />
      {error && <p className="form-error">{error}</p>}
      <div className="row-actions">
        <button type="button" className="btn small" onClick={save}>{text('save')}</button>
        <button type="button" className="btn small ghost" onClick={onClose}>{text('cancel')}</button>
      </div>
    </div>
  );
}

function hold(event) {
  event.preventDefault();
  event.stopPropagation();
}

export function fieldOrder(elements, keys) {
  return [...keys].sort((a, b) => {
    const left = elements.find((item) => item.element_key === a);
    const right = elements.find((item) => item.element_key === b);
    const byOrder = (left?.sort_order ?? 0) - (right?.sort_order ?? 0);
    if (byOrder) return byOrder;
    return (left?.id ?? 0) - (right?.id ?? 0);
  });
}

export function EditTools({ element, siblings = [], reload }) {
  const { text } = useUi();
  const [open, setOpen] = useState(false);
  const toolsRef = useRef(null);
  if (!element) return null;
  const ordered = [...siblings].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  async function move(direction) {
    const ids = ordered.map((item) => item.id);
    const index = ids.indexOf(element.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await api.reorderUi({ page: element.page, slot: element.slot, orderedIds: ids });
    await reload();
  }

  async function remove() {
    if (!window.confirm(text('confirm_delete'))) return;
    await api.deleteUi(element.id);
    await reload();
  }

  return (
    <span className="edit-tools" ref={toolsRef}>
      {ordered.length > 1 && (
        <>
          <button type="button" onClick={(event) => { hold(event); move(-1); }} aria-label="Move field up"><Lucide.ChevronUp size={14} /></button>
          <button type="button" onClick={(event) => { hold(event); move(1); }} aria-label="Move field down"><Lucide.ChevronDown size={14} /></button>
        </>
      )}
      <button type="button" onClick={(event) => { hold(event); setOpen((value) => !value); }} aria-label="Edit text"><Lucide.Pencil size={14} /></button>
      <button type="button" onClick={(event) => { hold(event); remove(); }} aria-label="Delete"><Lucide.Trash2 size={14} /></button>
      {open && <EditDialog element={element} anchor={toolsRef.current} reload={reload} onClose={() => setOpen(false)} />}
    </span>
  );
}

function sizedStyle(element) {
  const style = {};
  if (element.text_size) style.fontSize = `${element.text_size}px`;
  if (element.icon_size) style['--item-icon'] = `${element.icon_size}px`;
  return style;
}

function BlockBody({ element, onAction }) {
  const className = `block block-${element.element_type} ${shapeClass(element.shape)}`.trim();
  const style = sizedStyle(element);
  const inner = (
    <>
      <Icon name={element.icon} size={element.icon_size || 18} />
      <span>{element.content}</span>
    </>
  );
  if (element.element_type === 'heading') return <h1 className={className} style={style}>{inner}</h1>;
  if (element.element_type === 'subheading') return <p className={className} style={style}>{inner}</p>;
  if (element.element_type === 'section') return <h2 className={className} style={style}>{inner}</h2>;
  if (element.element_type === 'card' || element.element_type === 'shape') {
    return (
      <button type="button" className={className} style={style} onClick={() => element.action_key && onAction?.(element.action_key)}>
        {inner}
      </button>
    );
  }
  if (element.element_type === 'button') {
    return (
      <button type="button" className={`btn ${shapeClass(element.shape)}`.trim()} style={style} onClick={() => element.action_key && onAction?.(element.action_key)}>
        {inner}
      </button>
    );
  }
  if (element.element_type === 'label') return <span className={className} style={style}>{inner}</span>;
  return <p className={className} style={style}>{inner}</p>;
}

export function Stack({ slot = 'main', widgets = {}, onAction }) {
  const { page, elements, reload, text } = useUi();
  const { user } = useEditUser();
  const edit = user?.role === 'developer';
  const items = elements.filter((element) => element.slot === slot && element.page !== 'common');
  const [draft, setDraft] = useState({ element_type: 'shape', content: '', icon: '', action_key: '', shape: 'rounded' });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function add(event) {
    event.preventDefault();
    if (!draft.content.trim()) {
      setError(text('required'));
      return;
    }
    await api.createUi({ ...draft, page, slot, action_key: draft.action_key || null, icon: draft.icon || null, shape: draft.shape || null });
    setDraft({ element_type: 'shape', content: '', icon: '', action_key: '', shape: 'rounded' });
    setOpen(false);
    setError('');
    await reload();
  }

  return (
    <div className="stack">
      {items.map((element) => {
        const Widget = element.element_type === 'widget' ? widgets[element.action_key] : null;
        return (
          <section key={element.id} className={`stack-item ${edit ? 'is-editable' : ''} ${element.element_type === 'widget' ? shapeClass(element.shape) : ''}`.trim()}>
            {edit && <EditTools element={element} siblings={items} reload={reload} />}
            {Widget ? <Widget /> : element.element_type === 'widget' ? null : <BlockBody element={element} onAction={onAction} />}
          </section>
        );
      })}
      {edit && (
        <div className="add-block">
          <button type="button" className="btn ghost" onClick={() => setOpen((value) => !value)}>
            <Lucide.Plus size={16} /> {text('add_element')}
          </button>
          {open && (
            <form className="edit-dialog static" onSubmit={add}>
              <select value={draft.element_type} onChange={(event) => setDraft({ ...draft, element_type: event.target.value })}>
                {['heading', 'subheading', 'text', 'card', 'shape', 'icon', 'button', 'label', 'section', 'widget'].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <textarea rows={2} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
              <input placeholder="Icon name" value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })} />
              <input placeholder="Action key" value={draft.action_key} onChange={(event) => setDraft({ ...draft, action_key: event.target.value })} />
              <span className="picker-label">Shape</span>
              <ShapePicker value={draft.shape} onChange={(shape) => setDraft({ ...draft, shape })} />
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn small">{text('save')}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const EditUserContext = createContext(null);
export function EditUserProvider({ user, children }) {
  return <EditUserContext.Provider value={{ user }}>{children}</EditUserContext.Provider>;
}
function useEditUser() {
  return useContext(EditUserContext) || { user: null };
}

export function FieldLabel({ k, orderKeys, toolsOnly = false }) {
  const { map, reload, elements } = useUi();
  const { user } = useEditUser();
  const labelRef = useRef(null);
  const element = map[k];
  useLayoutEffect(() => {
    const host = labelRef.current?.closest('label, fieldset, h1, h2, h3, button, .block');
    if (!host) return undefined;
    if (element?.text_size) host.style.fontSize = `${element.text_size}px`;
    else host.style.fontSize = '';
    if (element?.icon_size) host.style.setProperty('--item-icon', `${element.icon_size}px`);
    else host.style.removeProperty('--item-icon');
    return undefined;
  }, [element?.text_size, element?.icon_size]);
  if (!element) return null;
  const siblings = orderKeys
    ? orderKeys.map((key) => elements.find((item) => item.element_key === key && item.page === element.page)).filter(Boolean)
    : elements.filter((item) => item.page === element.page && item.slot === element.slot);
  return (
    <span className="field-label" ref={labelRef} style={sizedStyle(element)}>
      <Icon name={element.icon} size={element.icon_size || 18} />
      {!toolsOnly && <span>{element.content}</span>}
      {user?.role === 'developer' && <EditTools element={element} siblings={siblings} reload={reload} />}
    </span>
  );
}

export function RemoteElements({ page }) {
  const [elements, setElements] = useState([]);

  async function reload() {
    const data = await api.ui(page);
    setElements(data.elements);
  }

  useEffect(() => {
    reload();
  }, [page]);

  return (
    <div className="remote-list">
      {elements.map((element) => (
        <article key={element.id} className="remote-row">
          <div>
            <small>{element.element_key}</small>
            <p>{element.content}</p>
          </div>
          <EditTools element={element} siblings={elements.filter((item) => item.slot === element.slot)} reload={reload} />
        </article>
      ))}
    </div>
  );
}
