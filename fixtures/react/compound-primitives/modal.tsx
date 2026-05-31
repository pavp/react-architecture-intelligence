import * as Dialog from "@radix-ui/react-dialog";

export function ModalRoot({ children }: { children: React.ReactNode }) { return <Dialog.Root>{children}</Dialog.Root>; }
export function ModalTrigger({ children }: { children: React.ReactNode }) { return <Dialog.Trigger>{children}</Dialog.Trigger>; }
export function ModalContent({ children }: { children: React.ReactNode }) { return <Dialog.Content>{children}</Dialog.Content>; }

export const Modal = ModalRoot;
Modal.Trigger = ModalTrigger;
Modal.Content = ModalContent;
export { Modal as DialogModal };

export function ModalExample() {
  return <Modal><Modal.Trigger>Open</Modal.Trigger><Modal.Content>Body</Modal.Content></Modal>;
}
