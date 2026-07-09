import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";

// Compatibility wrapper cho test hoặc entrypoint cũ; route thật nằm ở app/router.tsx.
export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
