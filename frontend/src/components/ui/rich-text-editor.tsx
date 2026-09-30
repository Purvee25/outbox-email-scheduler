"use client";

import TextAlign from "@tiptap/extension-text-align";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const TEXT_STYLES = [
  { label: "Normal", value: "p" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
] as const;
type Align = "left" | "center" | "right";
const ALIGN_CYCLE: Align[] = ["left", "center", "right"];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection while clicking toolbar buttons.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-field disabled:opacity-40",
        active && "bg-mint text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px bg-border" />;

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      style:
        TEXT_STYLES.find(
          (s) =>
            s.value !== "p" &&
            current.isActive("heading", { level: Number(s.value[1]) }),
        )?.value ?? "p",
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      ordered: current.isActive("orderedList"),
      bullet: current.isActive("bulletList"),
      quote: current.isActive("blockquote"),
      align: (ALIGN_CYCLE.find((a) => current.isActive({ textAlign: a })) ??
        "left") as Align,
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      canIndent: current.can().sinkListItem("listItem"),
      canOutdent: current.can().liftListItem("listItem"),
    }),
  });
  const chain = () => editor.chain().focus();
  const nextAlign =
    ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(state.align) + 1) % ALIGN_CYCLE.length]!;

  function setTextStyle(value: string) {
    if (value === "p") chain().setParagraph().run();
    else
      chain()
        .setHeading({ level: Number(value[1]) as 1 | 2 | 3 })
        .run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-pill bg-white px-3 py-1.5"
    >
      <ToolButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Icon>
          <path d="M4 8h7a4 4 0 0 1 0 8H8M4 8l3-3M4 8l3 3" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Icon>
          <path d="M16 8H9a4 4 0 0 0 0 8h3M16 8l-3-3M16 8l-3 3" />
        </Icon>
      </ToolButton>
      <Divider />
      <select
        aria-label="Text style"
        value={state.style}
        onChange={(event) => setTextStyle(event.target.value)}
        className="h-9 rounded-lg bg-transparent px-2 text-sm text-ink-muted hover:bg-field focus:outline-none"
      >
        {TEXT_STYLES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <Divider />
      <ToolButton
        label="Bold"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Icon>
          <path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Italic"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Icon>
          <path d="M8 4h6M6 16h6M11 4 9 16" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Underline"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <Icon>
          <path d="M6 4v6a4 4 0 0 0 8 0V4M4 17h12" />
        </Icon>
      </ToolButton>
      <Divider />
      <ToolButton
        label={`Align ${state.align} (click for ${nextAlign})`}
        onClick={() => chain().setTextAlign(nextAlign).run()}
      >
        <Icon>
          {state.align === "left" && <path d="M3 5h14M3 9h9M3 13h14M3 17h9" />}
          {state.align === "center" && (
            <path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9" />
          )}
          {state.align === "right" && <path d="M3 5h14M8 9h9M3 13h14M8 17h9" />}
        </Icon>
      </ToolButton>
      <Divider />
      <ToolButton
        label="Numbered list"
        active={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <Icon>
          <path d="M8 5h9M8 10h9M8 15h9M3.5 4.5 5 4v3M3 12h2l-2 2.5h2" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Bulleted list"
        active={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <Icon>
          <path d="M8 5h9M8 10h9M8 15h9M4 5h.01M4 10h.01M4 15h.01" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Indent list item"
        disabled={!state.canIndent}
        onClick={() => chain().sinkListItem("listItem").run()}
      >
        <Icon>
          <path d="M3 4h14M9 8h8M9 12h8M3 16h14M3 8l3 2-3 2z" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Outdent list item"
        disabled={!state.canOutdent}
        onClick={() => chain().liftListItem("listItem").run()}
      >
        <Icon>
          <path d="M3 4h14M9 8h8M9 12h8M3 16h14M6 8l-3 2 3 2z" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Quote"
        active={state.quote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <Icon>
          <path d="M4 7h4v4H4zM12 7h4v4h-4zM4 11c0 3 1 4 3 5M12 11c0 3 1 4 3 5" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Icon>
          <path d="M3 10h14M13 6.5C12.5 5 11 4.5 10 4.5c-2 0-3.5 1-3.5 2.5 0 1 .7 1.7 2 2.2M7 13.5c.5 1.5 2 2 3 2 2 0 3.5-1 3.5-2.5" />
        </Icon>
      </ToolButton>
    </div>
  );
}

interface RichTextEditorProps {
  /** HTML, emitted on every change. An empty editor emits "". */
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
  label: string;
}

export function RichTextEditor({
  onChange,
  placeholder,
  invalid,
  label,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    // Next renders on the server first; the editor only exists in the browser.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class:
          "rich-text min-h-[20rem] px-5 pt-4 pb-2 text-[15px] focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) =>
      onChange(current.isEmpty ? "" : current.getHTML()),
  });

  return (
    <div
      aria-invalid={invalid || undefined}
      className={cn(
        "relative rounded-card bg-field transition-colors focus-within:bg-white focus-within:outline-2 focus-within:outline-brand-500",
        invalid && "outline-2 outline-danger-fg",
      )}
    >
      {editor?.isEmpty && placeholder && (
        <p
          aria-hidden
          className="pointer-events-none absolute top-4 left-5 text-[15px] text-ink-muted"
        >
          {placeholder}
        </p>
      )}
      <EditorContent editor={editor} />
      {editor && (
        <div className="px-3 pb-3">
          <Toolbar editor={editor} />
        </div>
      )}
    </div>
  );
}
