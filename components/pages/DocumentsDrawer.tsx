import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
  } from "@/components/ui/drawer"
import { Button } from "../ui/button"

  export function DocumentsDrawer({open, onOpenChange}: {open: boolean, onOpenChange: (b: boolean) => void}): React.ReactElement {
    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent>
                <DrawerHeader>
                <DrawerTitle>Are you absolutely sure?</DrawerTitle>
                <DrawerDescription>This action cannot be undone.</DrawerDescription>
                </DrawerHeader>
                <DrawerFooter>
                <Button>Submit</Button>
                <DrawerClose>
                    Cancel
                </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
            </Drawer>
    )
  }