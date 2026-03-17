import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
}                      from 'react';
import { theme }       from 'antd';
import { SchemaForUI } from '@walcu-engineering/pdfme-common';

interface SuggestionEntry {
  name: string;
  isFunction?: boolean;
}

const SUGGESTIONS: SuggestionEntry[] = [
  // Built-in variables
  { name: 'date' },
  { name: 'dateTime' },
  { name: 'totalPages' },
  { name: 'currentPage' },
  // Math namespace
  { name: 'Math' },
  { name: 'Math.abs',         isFunction: true },
  { name: 'Math.ceil',        isFunction: true },
  { name: 'Math.floor',       isFunction: true },
  { name: 'Math.round',       isFunction: true },
  { name: 'Math.max',         isFunction: true },
  { name: 'Math.min',         isFunction: true },
  { name: 'Math.sqrt',        isFunction: true },
  { name: 'Math.pow',         isFunction: true },
  { name: 'Math.log',         isFunction: true },
  { name: 'Math.sign',        isFunction: true },
  { name: 'Math.trunc',       isFunction: true },
  { name: 'Math.random',      isFunction: true },
  // Constructors / type coercions
  { name: 'String',           isFunction: true },
  { name: 'Number',           isFunction: true },
  { name: 'Boolean',          isFunction: true },
  { name: 'Array',            isFunction: true },
  { name: 'Date',             isFunction: true },
  // JSON namespace
  { name: 'JSON' },
  { name: 'JSON.stringify',   isFunction: true },
  { name: 'JSON.parse',       isFunction: true },
  // Object namespace
  { name: 'Object' },
  { name: 'Object.keys',        isFunction: true },
  { name: 'Object.values',      isFunction: true },
  { name: 'Object.entries',     isFunction: true },
  { name: 'Object.fromEntries', isFunction: true },
  { name: 'Object.assign',      isFunction: true },
  // Global functions
  { name: 'isNaN',            isFunction: true },
  { name: 'parseFloat',       isFunction: true },
  { name: 'parseInt',         isFunction: true },
  { name: 'encodeURIComponent', isFunction: true },
  { name: 'decodeURIComponent', isFunction: true },
  { name: 'toDate',           isFunction: true },
  { name: 'newDate',          isFunction: true },
];

const SUGGESTION_NAMES = SUGGESTIONS.map((s) => s.name);
const FUNCTION_SUGGESTIONS = new Set(SUGGESTIONS.filter((s) => s.isFunction).map((s) => s.name));

function extractSubProperties(value: unknown, prefix: string, depth = 0): string[] {
  if (depth > 5 || typeof value !== 'object' || !value || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).flatMap((key) => {
    const fullPath = `${prefix}.${key}`;
    return [
      fullPath,
      ...extractSubProperties((value as Record<string, unknown>)[key], fullPath, depth + 1),
    ];
  });
}

function buildAllSuggestions(schemasList: SchemaForUI[][]): string[] {
  const seen = new Set<string>();
  const schemaVars: string[] = [];
  for (const page of schemasList) {
    for (const schema of page) {
      if (seen.has(schema.name)) continue;
      seen.add(schema.name);
      schemaVars.push(schema.name);
      if (schema.readOnly && schema.content) {
        try {
          console.debug('schema', schema);
          const parsed = JSON.parse(schema.content);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            extractSubProperties(parsed, schema.name).forEach((v) => schemaVars.push(v));
          }
        } catch {
          // not JSON
        }
      }
    }
  }
  return [...schemaVars, ...SUGGESTION_NAMES];
}

interface ExpressionContext {
  prefix: string;            // text used for filtering suggestions
  textToCursor: string;
  replacementLength: number; // chars to select backward before inserting
  inFunctionArg: boolean;    // cursor is inside (...) within the expression
}

function getExpressionContext(element: HTMLElement): ExpressionContext | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  const textToCursor = preRange.toString();

  // Find the innermost unclosed '{' (expression boundary)
  let depth = 0;
  let braceOpenIdx = -1;
  for (let i = textToCursor.length - 1; i >= 0; i--) {
    if (textToCursor[i] === '}') depth++;
    else if (textToCursor[i] === '{') {
      if (depth === 0) { braceOpenIdx = i; break; }
      depth--;
    }
  }
  if (braceOpenIdx === -1) return null;

  const exprPrefix = textToCursor.slice(braceOpenIdx + 1);

  // Detect if cursor is inside a function argument by scanning for unclosed '('
  let parenDepth = 0;
  let argStart = -1;
  for (let i = 0; i < exprPrefix.length; i++) {
    if (exprPrefix[i] === '(') {
      parenDepth++;
      if (parenDepth === 1) argStart = i + 1;
    } else if (exprPrefix[i] === ')') {
      parenDepth--;
      if (parenDepth === 0) argStart = -1;
    } else if (exprPrefix[i] === ',' && parenDepth === 1) {
      argStart = i + 1;
    }
  }

  if (parenDepth > 0 && argStart !== -1) {
    const argPrefix = exprPrefix.slice(argStart).trimStart();
    return { prefix: argPrefix, textToCursor, replacementLength: argPrefix.length, inFunctionArg: true };
  }

  return { prefix: exprPrefix, textToCursor, replacementLength: exprPrefix.length + 1, inFunctionArg: false };
}

function getCaretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  return range.getBoundingClientRect();
}

function filterSuggestions(allSuggestions: string[], prefix: string): string[] {
  if (!prefix) return allSuggestions.slice(0, 20);
  const lowerPrefix = prefix.toLowerCase();
  return allSuggestions
    .filter((s) => s.toLowerCase().includes(lowerPrefix) && s.toLowerCase() !== lowerPrefix)
    .slice(0, 20);
}

function insertSuggestion(element: HTMLElement, selected: string): void {
  element.focus();

  const context = getExpressionContext(element);
  if (!context) return;

  const selection = window.getSelection();
  if (!selection?.rangeCount) return;

  // Select backward the text to replace
  for (let i = 0; i < context.replacementLength; i++) {
    selection.modify('extend', 'backward', 'character');
  }

  const isFunction = FUNCTION_SUGGESTIONS.has(selected);

  if (context.inFunctionArg) {
    // Inside function parens — insert bare name, no {} wrapping
    if (isFunction) {
      document.execCommand('insertText', false, `${selected}()`);
      window.getSelection()?.modify('move', 'backward', 'character'); // cursor between ()
    } else {
      document.execCommand('insertText', false, selected);
    }
  } else {
    const fullText = element.innerText;
    const afterCursor = fullText.slice(context.textToCursor.length);
    const closingBraceExists = afterCursor.startsWith('}');

    if (isFunction) {
      if (closingBraceExists) {
        // Insert '{selected()' — the existing '}' closes the expression
        document.execCommand('insertText', false, `{${selected}()`);
        window.getSelection()?.modify('move', 'backward', 'character');
      } else {
        // Insert '{selected()}', move back 2 to land between '(' and ')'
        document.execCommand('insertText', false, `{${selected}()}`);
        const sel = window.getSelection();
        sel?.modify('move', 'backward', 'character');
        sel?.modify('move', 'backward', 'character');
      }
    } else {
      const insertText = closingBraceExists ? `{${selected}` : `{${selected}}`;
      document.execCommand('insertText', false, insertText);
      if (closingBraceExists) {
        window.getSelection()?.modify('move', 'forward', 'character');
      }
    }
  }
}

function isTextSchemaElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.id.startsWith('text-');
}

interface SuggestionState {
  visible: boolean;
  suggestions: string[];
  selectedIndex: number;
  position: { top: number; left: number };
  activeElement: HTMLElement | null;
}

const initialState: SuggestionState = {
  visible: false,
  suggestions: [],
  selectedIndex: 0,
  position: { top: 0, left: 0 },
  activeElement: null,
};

interface Props {
  schemasList: SchemaForUI[][];
}

const ExpressionAutosuggest: React.FC<Props> = ({ schemasList }) => {
  const { token } = theme.useToken();
  const allSuggestions = useMemo(() => buildAllSuggestions(schemasList), [schemasList]);

  const [state, setState] = useState<SuggestionState>(initialState);
  const selectedItemRef = useRef<HTMLLIElement | null>(null);

  // Scroll selected item into view when selectedIndex changes
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [state.selectedIndex]);

  // Keep refs for use inside stable callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const allSuggestionsRef = useRef(allSuggestions);
  allSuggestionsRef.current = allSuggestions;

  const schemasListRef = useRef(schemasList);
  schemasListRef.current = schemasList;

  const handleInput = useCallback((e: Event) => {
    const target = e.target;
    if (!isTextSchemaElement(target)) {
      setState((prev) => (prev.visible ? { ...prev, visible: false, activeElement: null } : prev));
      return;
    }

    const schemaId = target.id.slice('text-'.length);
    const schema = schemasListRef.current.flat().find((s) => s.id === schemaId);
    if (!schema?.readOnly) {
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const context = getExpressionContext(target);
    if (!context) {
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const filtered = filterSuggestions(allSuggestionsRef.current, context.prefix);
    if (filtered.length === 0) {
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const rect = getCaretRect();
    if (!rect) return;

    setState({
      visible: true,
      suggestions: filtered,
      selectedIndex: 0,
      position: { top: rect.bottom, left: rect.left },
      activeElement: target,
    });
  }, []);

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    const current = stateRef.current;
    if (!current.visible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setState((prev) => ({
        ...prev,
        selectedIndex: (prev.selectedIndex + 1) % prev.suggestions.length,
      }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setState((prev) => ({
        ...prev,
        selectedIndex:
          (prev.selectedIndex - 1 + prev.suggestions.length) % prev.suggestions.length,
      }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const selected = current.suggestions[current.selectedIndex];
      if (current.activeElement && selected) {
        e.preventDefault();
        e.stopPropagation();
        insertSuggestion(current.activeElement, selected);
        setState((prev) => ({ ...prev, visible: false }));
      }
    } else if (e.key === 'Escape') {
      setState((prev) => ({ ...prev, visible: false }));
    }
  }, []);

  const handleFocusout = useCallback((e: FocusEvent) => {
    if (!isTextSchemaElement(e.target)) return;
    // Delay to let mousedown on a suggestion item fire first (prevents premature close)
    setTimeout(() => {
      setState((prev) => (prev.visible ? { ...prev, visible: false, activeElement: null } : prev));
    }, 150);
  }, []);

  useEffect(() => {
    document.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKeydown, true); // capture phase
    document.addEventListener('focusout', handleFocusout);

    return () => {
      document.removeEventListener('input', handleInput);
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('focusout', handleFocusout);
    };
  }, [handleInput, handleKeydown, handleFocusout]);

  if (!state.visible || state.suggestions.length === 0) return null;

  return (
    <ul
      style={{
        position: 'fixed',
        top: state.position.top + 4,
        left: state.position.left,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        boxShadow: token.boxShadow,
        zIndex: 9999,
        maxHeight: 240,
        overflowY: 'auto',
        padding: 0,
        margin: 0,
        listStyle: 'none',
        minWidth: 200,
      }}
    >
      {state.suggestions.map((s, i) => (
        <li
          key={s}
          ref={i === state.selectedIndex ? selectedItemRef : null}
          style={{
            padding: `${token.paddingXS}px ${token.paddingSM}px`,
            background: i === state.selectedIndex ? token.colorPrimaryBg : 'transparent',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: token.fontSizeSM,
            color: token.colorText,
            userSelect: 'none',
          }}
          onMouseDown={(e) => {
            // Prevent blur on the contenteditable so selection is preserved
            e.preventDefault();
            if (state.activeElement) {
              insertSuggestion(state.activeElement, s);
            }
            setState((prev) => ({ ...prev, visible: false }));
          }}
          onMouseEnter={() => setState((prev) => ({ ...prev, selectedIndex: i }))}
        >
          {s}
        </li>
      ))}
    </ul>
  );
};

export default ExpressionAutosuggest;
