import React from 'react';
import {
  ANNEX_TITLE,
  parseAnnexSections,
  splitContractForDisplay,
} from '../../../utils/contractSections';
import { parseContractTextBlocks } from './parseContractTextBlocks';
import styles from './ContractTextViewer.module.css';

interface ContractTextViewerProps {
  text: string;
}

function emphasizeMarkers(text: string): React.ReactNode {
  if (!text.includes('!!!')) return text;
  return <strong className={styles.emphasis}>{text}</strong>;
}

function ContractBlocks({ text }: { text: string }) {
  const blocks = parseContractTextBlocks(text);

  return (
    <div className={styles.mainBody}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h4 key={`h-${index}`} className={styles.heading}>
              {block.text}
            </h4>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={`l-${index}`} className={styles.list}>
              {block.items.map((item, itemIndex) => (
                <li key={`li-${index}-${itemIndex}`} className={styles.listItem}>
                  {emphasizeMarkers(item)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={`p-${index}`} className={styles.paragraph}>
            {emphasizeMarkers(block.text)}
          </p>
        );
      })}
    </div>
  );
}

const ContractTextViewer: React.FC<ContractTextViewerProps> = ({ text }) => {
  const { mainText, annexText } = splitContractForDisplay(text);

  if (!annexText) {
    return (
      <article className={styles.document} dir="rtl">
        <ContractBlocks text={text} />
      </article>
    );
  }

  const sections = parseAnnexSections(annexText);

  return (
    <article className={styles.document} dir="rtl">
      <ContractBlocks text={mainText} />

      <div className={styles.annexWrap}>
        <div className={styles.annexPanel}>
          <h3 className={styles.annexTitle}>{ANNEX_TITLE}</h3>
          {sections.map((section) => (
            <div key={section.title} className={styles.sectionCard}>
              <h4 className={styles.sectionTitle}>{section.title}</h4>
              <div className={styles.sectionBody}>
                <ContractBlocks text={section.body} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};

export default ContractTextViewer;
