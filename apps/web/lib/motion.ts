import type { Transition, Variants } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 400, damping: 28 };
export const page: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: .22 } },
  exit: { opacity: 0, y: -5, transition: { duration: .12 } },
};
export const stagger: Variants = {
  hidden: {}, visible: { transition: { staggerChildren: .045 } },
};
export const item: Variants = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: spring } };
export const overlay: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };
export const dialog: Variants = {
  hidden: { opacity: 0, scale: .96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: .97, y: 5 },
};
export const press = { scale: .97 };
export const lift = { y: -4, scale: 1.015 };
