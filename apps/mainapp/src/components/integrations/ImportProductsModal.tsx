import type { StoreDTO } from '@zetsales/shared';
import { ImportEntityModal } from './ImportEntityModal';

interface ImportProductsModalProps {
  store: StoreDTO | null;
  onClose: () => void;
  onImported: (storeId: string, productCount: number) => void;
  autoStart?: boolean;
}

export function ImportProductsModal(props: ImportProductsModalProps) {
  return <ImportEntityModal entity="products" {...props} />;
}
