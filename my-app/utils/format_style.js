import Svg, { Path } from "react-native-svg";

export const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

export const GoogleLogo = () => (
  <Svg width={20} height={20} viewBox="0 0 533.5 544.3">
    <Path
      fill="#4285F4"
      d="M533.5 278.4c0-17.4-1.5-34.1-4.4-50.4H272v95.4h146.9c-6.3 33.9-25 62.6-53.4 81.8v67h86.2c50.4-46.4 81.8-114.9 81.8-193.8z"
    />
    <Path
      fill="#34A853"
      d="M272 544.3c72.9 0 134.1-24.1 178.8-65.5l-86.2-67c-23.9 16.1-54.5 25.7-92.6 25.7-71 0-131.1-47.9-152.7-112.3h-90v70.5C77.9 482.6 167.4 544.3 272 544.3z"
    />
    <Path
      fill="#FBBC05"
      d="M119.3 325.2c-10.6-31.4-10.6-65.4 0-96.8v-70.5h-90C4.3 212.5 0 241.6 0 272c0 30.4 4.3 59.5 29.3 114.1l90-70.9z"
    />
    <Path
      fill="#EA4335"
      d="M272 107.7c39.7 0 75.3 13.7 103.4 40.6l77.4-77.4C406.1 24.1 344.9 0 272 0 167.4 0 77.9 61.7 29.3 157.9l90 70.5C140.9 155.6 201 107.7 272 107.7z"
    />
  </Svg>
);
