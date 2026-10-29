import heroImage from "../assets/hero.png";
import { BsArrowRight } from "react-icons/bs";
import { useNavigate } from "react-router-dom";

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section
      className="text-white d-flex align-items-center"
      style={{
        minHeight: "100vh",
        backgroundImage: `url(${heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        paddingTop: "90px",
      }}
    >
      <div className="container-fluid px-4">
        <div className="row">
          <div className="col-lg-6">

            <h1 className="display-3 fw-bold mb-4">
              Your Personal
              <span className="text-info"> AI Digital Twin</span>
              <br />
              for Smarter Learning
            </h1>

            <p className="lead mb-4">
              Learn faster with your own AI-powered mentor. Upload notes,
              ask questions, generate quizzes, track progress and receive
              personalized learning recommendations.
            </p>

            <div className="d-flex gap-3 mb-5">
              <button
                className="btn btn-info btn-lg px-4"
                onClick={() => navigate("/upload-pdf")}
              >
                Upload documents
                <BsArrowRight size={22} />
              </button>
            </div>

            <div className="row text-center text-lg-start">
              <div className="col-4">
                <h3 className="text-info fw-bold">10K+</h3>
                <p>Students</p>
              </div>

              <div className="col-4">
                <h3 className="text-info fw-bold">24/7</h3>
                <p>AI Support</p>
              </div>

              <div className="col-4">
                <h3 className="text-info fw-bold">95%</h3>
                <p>Success Rate</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;