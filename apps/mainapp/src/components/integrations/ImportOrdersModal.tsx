import type { StoreDTO } from '@zetsales/shared';
import { ImportEntityModal } from './ImportEntityModal';

interface ImportOrdersModalProps {
  store: StoreDTO | null;
  onClose: () => void;
  onImported: (storeId: string, orderCount: number) => void;
  autoStart?: boolean;
}

export function ImportOrdersModal(props: ImportOrdersModalProps) {
  return <ImportEntityModal entity="orders" {...props} />;
}
