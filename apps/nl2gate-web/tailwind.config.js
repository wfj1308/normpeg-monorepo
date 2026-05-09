export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Space Grotesk", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
                mono: ["JetBrains Mono", "Consolas", "monospace"]
            },
            colors: {
                brand: {
                    50: "#eef9f7",
                    100: "#d7f2ec",
                    200: "#afe5d8",
                    300: "#87d7c5",
                    400: "#4fc1a9",
                    500: "#1aa485",
                    600: "#117f67",
                    700: "#0d6654",
                    800: "#0c5044",
                    900: "#0b4239"
                }
            },
            boxShadow: {
                panel: "0 18px 50px -24px rgba(10, 33, 28, 0.45)"
            }
        }
    },
    plugins: []
};
