// @ts-nocheck
export function ModalRoot({ children }: { children: React.ReactNode }) { return <div>{children}</div>; }
export function ModalTrigger({ children }: { children: React.ReactNode }) { return <button>{children}</button>; }

export const Modal = ModalRoot;
Modal.Trigger = ModalTrigger;

export function DivergentModalExample() {
  return <Modal><Modal.Trigger>Open</Modal.Trigger><Modal.Footer>Actions</Modal.Footer></Modal>;
}
