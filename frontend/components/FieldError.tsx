/**
 * Inline validation message under a form field. Pair it with
 * aria-invalid + aria-describedby={id} on the input so screen readers
 * announce the error with the field, and <Input> picks up the heat border.
 */
export default function FieldError({ id, message }: { id?: string; message?: string }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="text-[11.5px] text-destructive">
            {message}
        </p>
    );
}
