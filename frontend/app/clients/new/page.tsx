import { redirect } from 'next/navigation';

// Client creation is the ClientFormDialog on /clients now (the same form the
// client page uses to edit). Kept as a route so bookmarks and old links work.
export default function NewClientPage() {
    redirect('/clients?new=1');
}
