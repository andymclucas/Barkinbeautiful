"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  /**
   * Passed through to cmdk's <Command>.
   *
   * Added 03/11/2026 for the global search, where the SERVER decides
   * what matches and in what order. cmdk otherwise filters items by
   * their `value`, so a result matched on a phone number or an address
   * — text that is not in the visible row — gets filtered straight back
   * out, and a stable id as the value filters out everything.
   */
  shouldFilter,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  shouldFilter?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {/*
        * overflow-hidden belongs on the Command, NOT on the DialogContent.
        *
        * The rounded corners it is there for belong to the command list.
        */}
      <DialogContent
        className={cn("p-0", className)}
        /*
         * Andy, 03/11/2026: "the corner alignment is off - give some more
         * padding to the edge so it's cleaner."
         *
         * The shared dialog close is positioned with a NEGATIVE right
         * margin, which is tuned for the p-6 every other dialog has: it
         * pulls the button back from the content box to sit a sensible
         * distance inside the corner. This dialog is p-0 so the content
         * box IS the edge, and the same margin pushed the button outside
         * the rounded corner entirely.
         *
         * No single margin can serve both paddings, so the palette places
         * its own instead. It is the only CommandDialog and the only p-0
         * dialog in the app, so this stays local rather than re-tuning
         * the close button for thirty dialogs that are already right.
         */
        showCloseButton={false}
      >
        {/*
          * The group padding and the item padding add up to the px-5 of
          * the input row above and the "Look in" row below it, so every
          * icon, heading and name in the palette sits on ONE left edge.
          * They did not before: headings and rows started 8px in from
          * the search icon, which is the misalignment that reads as
          * "the padding looks a bit off" without being nameable.
          */}
        <Command shouldFilter={shouldFilter} className="relative overflow-hidden rounded-xl [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5">
          {children}
          {showCloseButton && (
            /*
             * Inset from the corner on both axes rather than hung over it,
             * and vertically centred in the 48px input row. Positive
             * offsets, so the Command's own overflow-hidden cannot clip
             * it - which is what sliced the previous one in half.
             */
            <DialogClose
              className="ring-offset-background focus:ring-ring absolute top-2.5 right-3 z-10 rounded-full bg-background/85 p-1.5 opacity-60 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden [&_svg]:size-4 [&_svg]:shrink-0"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    /*
      * Andy, 03/11/2026: "add some padding around the search box at the
      * top also", then "padding still looks a bit off - just clean it up
      * a bit and make the layout modern and clean."
      *
      * Roomier than a form field, because it is not one. This is the
      * whole point of the dialog, so it gets the height and the type size
      * of a heading rather than of an input squeezed into a row.
      *
      * `pr-14` is not symmetry for its own sake - it is the room the
      * close button needs, so a long query runs under the X rather than
      * into it.
      */
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-3 border-b px-5 py-4 pr-14"
    >
      <SearchIcon className="size-[18px] shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        /*
         * Andy sent a screenshot of the palette offering his saved
         * passwords - four email addresses, over the results.
         *
         * A bare text input with no hints looks like a username field to
         * a password manager. `autoComplete="off"` alone is widely
         * ignored by Chrome and Safari, so this also gives the field a
         * name that is plainly not a login, and carries the explicit
         * opt-outs 1Password and LastPass read.
         *
         * No `type="search"`: cmdk omits `type` from its Input props and
         * sets it itself, so passing one does not compile. The
         * attributes below are the ones managers actually key off.
         */
        name="salon-search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        /*
         * No focus ring, deliberately.
         *
         * index.css gives every input a 3px brand-coloured ring on
         * focus, which is right for a form. Here the input is
         * autofocused the moment the dialog opens, so the ring is
         * ALWAYS on - and drawn inside a tight row it reads as a box
         * crammed into the corner rather than as a search field. That is
         * what Andy was looking at when he said the padding was off.
         *
         * Nothing is lost: the palette is modal and this is the only
         * thing focusable in it, so there is no ambiguity for the ring
         * to resolve.
         */
        className={cn(
          "placeholder:text-muted-foreground/70 flex h-7 w-full bg-transparent text-base outline-hidden",
          "focus-visible:border-transparent focus-visible:shadow-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[min(380px,60vh)] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
