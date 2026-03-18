import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Predictions from "./pages/Predictions";
import ValueBets from "./pages/ValueBets";
import FormGuide from "./pages/FormGuide";
import Standings from "./pages/Standings";
import Models from "./pages/Models";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/tips"      element={<Predictions />} />
            <Route path="/value"     element={<ValueBets />} />
            <Route path="/form"      element={<FormGuide />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/models"    element={<Models />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
