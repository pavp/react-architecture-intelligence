function SignupBtn({ label, onClick, size }) {
  const theme = useTheme();
  return <button data-size={size} onClick={onClick}>{label}</button>;
}
export default SignupBtn;
