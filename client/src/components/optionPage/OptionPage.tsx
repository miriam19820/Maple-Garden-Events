import { useLocation, useNavigate } from 'react-router-dom';
import BookingForm from '../BookingForm/BookingForm';
import { EmptyState, Button } from '../ui';
import './OptionPage.css';

const OptionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedDates = location.state?.selectedDates || [];

  if (selectedDates.length === 0) {
    return (
      <div className="option-page-container">
        <EmptyState
          title="לא נבחרו תאריכים"
          message="חזרו ללוח השנה ובחרו תאריכים לשמירת אופציה"
        />
        <Button variant="primary" onClick={() => navigate('/calendar')}>
          חזרה ללוח שנה
        </Button>
      </div>
    );
  }

  return (
    <BookingForm
      initialDates={selectedDates}
      isOption={true}
    />
  );
};

export default OptionPage;
