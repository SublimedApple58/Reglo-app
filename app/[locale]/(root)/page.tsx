import { redirect } from "next/navigation";

const Homepage = async () => {

  redirect("/user/home")
  return <></>;
};

export default Homepage;
