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
        <Command shouldFilter={shouldFilter} className="relative overflow-hidden rounded-xl [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
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
      * top also."
      *
      * The input sat flush against the dialog's own edge, so the caret
      * started a couple of pixels from the corner. `pr-12` is not
      * symmetry for its own sake - it is the room the close button needs,
      * so a long query runs under the X rather than into it.
      */
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-2.5 border-b px-4 py-2.5 pr-12"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
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
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
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
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
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
