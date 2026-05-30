function CtaButton({ label, onClick, variant }) {
  const theme = useTheme();
  return <button className={variant} onClick={onClick}>{label}</button>;
}
export default CtaButton;
