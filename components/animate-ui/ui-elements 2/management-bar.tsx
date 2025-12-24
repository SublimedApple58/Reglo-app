"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Ban,
  X,
  ArrowUpFromLine,
  FileSliders,
} from "lucide-react";
import { SlidingNumber } from "@/components/animate-ui/text/sliding-number";
import { motion, Variants, Transition, type HTMLMotionProps } from "motion/react";
import { FilePlus2 } from "lucide-react";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAtomValue } from "jotai";
import { Documents } from "@/atoms/TabelsStore";

const BUTTON_MOTION_CONFIG = {
  initial: "rest",
  whileHover: "hover",
  whileTap: "tap",
  variants: {
    rest: { maxWidth: "40px" },
    hover: {
      maxWidth: "140px",
      transition: { type: "spring", stiffness: 200, damping: 35, delay: 0.15 },
    },
    tap: { scale: 0.95 },
  },
  transition: { type: "spring", stiffness: 250, damping: 25 },
} satisfies Omit<HTMLMotionProps<"button">, "ref">;

const LABEL_VARIANTS: Variants = {
  rest: { opacity: 0, x: 4 },
  hover: { opacity: 1, x: 0, visibility: "visible" },
  tap: { opacity: 1, x: 0, visibility: "visible" },
};

const LABEL_TRANSITION: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
};

const PAGE_DIMENSION = 20;

function ManagementBar({totalRows}: {totalRows: number}) {

  const [currentPage, setCurrentPage] = React.useState(1);
  const [TOTAL_PAGES, setTotalPages] = React.useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const page = searchParams.get("page")

  useEffect(() => {
    if(totalRows){
      setTotalPages(Math.ceil(totalRows / PAGE_DIMENSION))
    }
  }, [totalRows])

  useEffect(() => {
    if(page){
      setCurrentPage(Number(page))
    }
  }, [page])

  useEffect(() => {
    if (Number(page) !== currentPage) {
      const params = new URLSearchParams(searchParams.toString());
      if (page) {
        params.set("page", currentPage.toString());
      }
      router.push(`${pathname}?${params}`);
    }
  }, [currentPage, page, pathname, router, searchParams]);
  
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < TOTAL_PAGES) setCurrentPage(currentPage + 1);
  };

  return (
    <div
      className="flex w-fit flex-wrap items-center gap-y-2 rounded-2xl border border-border bg-background p-2 shadow-lg"
      style={{
        transform: "scale(.8)",
        transformOrigin: "right",
        background: "white",
      }}
    >
      <div className="mx-auto flex shrink-0 items-center">
        <button
          disabled={currentPage === 1}
          className="p-1 text-muted-foreground transition-colors hover:text-foreground disabled:text-muted-foreground/30 disabled:hover:text-muted-foreground/30"
          onClick={handlePrevPage}
        >
          <ChevronLeft size={20} />
        </button>
        <div className="mx-2 flex items-center space-x-1 text-sm tabular-nums">
          <SlidingNumber
            className="text-foreground"
            padStart
            number={currentPage}
          />
          <span className="text-muted-foreground">/ {TOTAL_PAGES}</span>
        </div>
        <button
          disabled={currentPage === TOTAL_PAGES}
          className="p-1 text-muted-foreground transition-colors hover:text-foreground disabled:text-muted-foreground/30 disabled:hover:text-muted-foreground/30"
          onClick={handleNextPage}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mx-3 h-6 w-px bg-border rounded-full" />

      <motion.div
        layout
        layoutRoot
        className="mx-auto flex flex-wrap space-x-2 sm:flex-nowrap"
      >
        <motion.button
          {...BUTTON_MOTION_CONFIG}
          className="flex h-10 items-center space-x-2 overflow-hidden whitespace-nowrap rounded-lg bg-neutral-200/60 dark:bg-neutral-600/80 px-2.5 py-2 text-neutral-600 dark:text-neutral-200"
          aria-label="Disable file"
        >
          <Ban size={20} className="shrink-0" />
          <motion.span
            variants={LABEL_VARIANTS}
            transition={LABEL_TRANSITION}
            className="invisible text-sm"
          >
            Disable file
          </motion.span>
        </motion.button>

        <motion.button
          {...BUTTON_MOTION_CONFIG}
          className="flex h-10 items-center space-x-2 overflow-hidden whitespace-nowrap rounded-lg bg-red-200/60 dark:bg-red-800/80 px-2.5 py-2 text-red-600 dark:text-red-300"
          aria-label="Delete file"
        >
          <X size={20} className="shrink-0" />
          <motion.span
            variants={LABEL_VARIANTS}
            transition={LABEL_TRANSITION}
            className="invisible text-sm"
          >
            Delete file
          </motion.span>
        </motion.button>

        <motion.button
          {...BUTTON_MOTION_CONFIG}
          className="flex h-10 items-center space-x-2 overflow-hidden whitespace-nowrap rounded-lg bg-green-200/60 dark:bg-green-800/80 px-2.5 py-2 text-green-600 dark:text-green-300"
          aria-label="Upload file"
        >
          <FileSliders className="shrink-0" />
          <motion.span
            variants={LABEL_VARIANTS}
            transition={LABEL_TRANSITION}
            className="invisible text-sm"
          >
            Edit file
          </motion.span>
        </motion.button>
      </motion.div>

      <div className="mx-3 hidden h-6 w-px bg-border sm:block rounded-full" />

      <div className="flex gap-2 flex-grow">
        <motion.button
          whileTap={{ scale: 0.975 }}
          className="flex w-full h-10 text-sm cursor-pointer items-center justify-center rounded-lg bg-teal-500 dark:bg-teal-600/80 px-3 py-2 text-white transition-colors duration-300 dark:hover:bg-teal-800 hover:bg-teal-600 sm:w-auto"
        >
          {/* <span className="mr-1 text-neutral-200">Move to:</span> */}
          <span>Create PDF</span>
          <div className="mx-3 h-5 w-px bg-white/40 rounded-full" />
          {/* <Command size={14} />E */}
          <FilePlus2 />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.975 }}
          className="flex w-full h-10 text-sm cursor-pointer items-center justify-center rounded-lg bg-blue-700 dark:bg-blue-900 px-3 py-2 text-white transition-colors duration-300 hover:bg-blue-600 dark:hover:bg-blue-800 sm:w-auto"
        >
          {/* <span className="mr-1 text-neutral-200">Move to:</span> */}
          <span>Upload file</span>
          <div className="mx-3 h-5 w-px bg-white/40 rounded-full" />
          {/* <Command size={14} />E */}
          <ArrowUpFromLine />
        </motion.button>
      </div>
    </div>
  );
}

export { ManagementBar };
