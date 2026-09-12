import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";

interface FileViewerModalProps {
  visible: boolean;
  url: string;
  name: string;
  onClose: () => void;
  colors: any;
}

export function FileViewerModal({ visible, url, onClose }: FileViewerModalProps) {
  useEffect(() => {
    if (visible && url) {
      Haptics.selectionAsync();
      WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      }).finally(() => {
        onClose();
      });
    }
  }, [visible, url]);

  return null;
}
