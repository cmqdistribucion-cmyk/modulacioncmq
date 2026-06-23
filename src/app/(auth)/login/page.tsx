import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xl font-semibold">Acceso</div>
        <div className="text-sm text-muted-foreground">
          Ingresá con tu usuario para empezar a modular.
        </div>
      </div>
      <LoginForm />
    </div>
  );
}

